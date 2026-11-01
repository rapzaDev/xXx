import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {categoryKey,categoryName} from './adapters.mjs';
import {parseSource} from '../public/catalog.js';
import {searchGroups,normalizeText} from '../public/search-terms.js';
const iso=()=>new Date().toISOString();
export class CatalogDatabase {
 constructor(path){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  this.db=new DatabaseSync(path);this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  this.db.exec(`
   CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,name TEXT NOT NULL,url TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'pending',message TEXT NOT NULL DEFAULT '',checked_at TEXT);
   CREATE TABLE IF NOT EXISTS categories(key TEXT PRIMARY KEY,name TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS source_categories(source_id TEXT NOT NULL REFERENCES sources(id),url TEXT NOT NULL,category_key TEXT NOT NULL REFERENCES categories(key),PRIMARY KEY(source_id,url));
   CREATE TABLE IF NOT EXISTS videos(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id),external_id TEXT NOT NULL,source_url TEXT NOT NULL,title TEXT NOT NULL,author TEXT NOT NULL,thumbnail TEXT,duration TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,checked_at TEXT NOT NULL,manual_data TEXT,available INTEGER NOT NULL DEFAULT 1,UNIQUE(source_id,external_id));
   CREATE TABLE IF NOT EXISTS video_categories(video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,category_key TEXT NOT NULL REFERENCES categories(key),PRIMARY KEY(video_id,category_key));
   CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id),url TEXT NOT NULL,kind TEXT NOT NULL,category_key TEXT,position INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,next_at TEXT NOT NULL,updated_at TEXT NOT NULL,error TEXT NOT NULL DEFAULT '',UNIQUE(source_id,url,kind));
   CREATE TABLE IF NOT EXISTS collection_runs(id INTEGER PRIMARY KEY,started_at TEXT NOT NULL,finished_at TEXT,status TEXT NOT NULL,pages INTEGER NOT NULL DEFAULT 0,added INTEGER NOT NULL DEFAULT 0,errors INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '');
   CREATE TABLE IF NOT EXISTS daily_usage(day TEXT NOT NULL,source_id TEXT NOT NULL,pages INTEGER NOT NULL,PRIMARY KEY(day,source_id));
   CREATE TABLE IF NOT EXISTS page_fingerprints(source_id TEXT NOT NULL,category_key TEXT NOT NULL,fingerprint TEXT NOT NULL,url TEXT NOT NULL,PRIMARY KEY(source_id,category_key,fingerprint));
   CREATE TABLE IF NOT EXISTS collector_lock(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,expires_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS videos_source ON videos(source_id,available);
   CREATE INDEX IF NOT EXISTS jobs_due ON jobs(source_id,state,next_at,position);
   CREATE INDEX IF NOT EXISTS categories_video ON video_categories(category_key,video_id);
   CREATE VIRTUAL TABLE IF NOT EXISTS video_search USING fts5(title,author,content='videos',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2');
   CREATE TRIGGER IF NOT EXISTS video_search_insert AFTER INSERT ON videos BEGIN INSERT INTO video_search(rowid,title,author) VALUES(new.rowid,new.title,new.author); END;
   CREATE TRIGGER IF NOT EXISTS video_search_delete AFTER DELETE ON videos BEGIN INSERT INTO video_search(video_search,rowid,title,author) VALUES('delete',old.rowid,old.title,old.author); END;
   CREATE TRIGGER IF NOT EXISTS video_search_update AFTER UPDATE OF title,author ON videos BEGIN INSERT INTO video_search(video_search,rowid,title,author) VALUES('delete',old.rowid,old.title,old.author); INSERT INTO video_search(rowid,title,author) VALUES(new.rowid,new.title,new.author); END;
  `);
  if(!this.db.prepare('PRAGMA table_info(jobs)').all().some(column=>column.name==='refresh'))this.db.exec('ALTER TABLE jobs ADD COLUMN refresh INTEGER NOT NULL DEFAULT 0');
  if(this.db.prepare('PRAGMA user_version').get().user_version<3){this.normalizeCategories();this.db.exec('PRAGMA user_version=3')}

 }
 normalizeCategories(){this.transaction(()=>{
  const rows=this.db.prepare("SELECT DISTINCT c.* FROM categories c JOIN source_categories sc ON sc.category_key=c.key WHERE sc.source_id!='manual'").all();
  for(const row of rows){const name=categoryName(row.name),key=categoryKey(name);if(!key||key===row.key)continue;
   this.db.prepare('INSERT OR IGNORE INTO categories(key,name) VALUES(?,?)').run(key,name);
   this.db.prepare('INSERT OR IGNORE INTO video_categories(video_id,category_key) SELECT video_id,? FROM video_categories WHERE category_key=? ORDER BY rowid').run(key,row.key);
   this.db.prepare('DELETE FROM video_categories WHERE category_key=?').run(row.key);
   this.db.prepare('UPDATE source_categories SET category_key=? WHERE category_key=?').run(key,row.key);
   this.db.prepare('UPDATE jobs SET category_key=? WHERE category_key=?').run(key,row.key);
   this.db.prepare('INSERT OR IGNORE INTO page_fingerprints(source_id,category_key,fingerprint,url) SELECT source_id,?,fingerprint,url FROM page_fingerprints WHERE category_key=?').run(key,row.key);
   this.db.prepare('DELETE FROM page_fingerprints WHERE category_key=?').run(row.key);
   this.db.prepare('DELETE FROM categories WHERE key=?').run(row.key);
  }
 })}
 close(){this.db.close()}
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result}catch(e){this.db.exec('ROLLBACK');throw e}}
 syncSources(sources){this.transaction(()=>{
  this.db.prepare("UPDATE sources SET enabled=0 WHERE id!='manual'").run();
  for(const source of sources)this.db.prepare('INSERT INTO sources(id,name,url,enabled) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,url=excluded.url,enabled=excluded.enabled').run(source.id,source.name,source.url,source.enabled===false?0:1);
  this.db.prepare("INSERT OR IGNORE INTO sources(id,name,url,status,checked_at) VALUES('manual','Adicionados manualmente','', 'ready',?)").run(iso());
 })}
 addCategory(sourceId,{name,url}){
  name=sourceId==='manual'?name:categoryName(name);const key=categoryKey(name);if(!key)return null;
  this.db.prepare('INSERT OR IGNORE INTO categories(key,name) VALUES(?,?)').run(key,name.trim().replace(/\s+/g,' '));
  this.db.prepare('INSERT OR IGNORE INTO source_categories(source_id,url,category_key) VALUES(?,?,?)').run(sourceId,url,key);return key;
 }
 enqueue(sourceId,url,kind,category=null,position=0){const now=iso();this.db.prepare('INSERT OR IGNORE INTO jobs(source_id,url,kind,category_key,position,next_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(sourceId,url,kind,category,position,now,now)}
 prepareSource(source,intervalHours){
  this.enqueue(source.id,source.url+'/','discover');if(source.directory)this.enqueue(source.id,new URL(source.directory,source.url).href,'directory');
  const cutoff=new Date(Date.now()-intervalHours*3600000).toISOString(),dayAgo=new Date(Date.now()-86400000).toISOString();
  this.db.prepare("UPDATE jobs SET state='queued',refresh=1,attempts=0,error='',next_at=? WHERE source_id=? AND state='done' AND ((kind IN ('discover','directory') AND updated_at<?) OR (kind='category' AND position=0 AND updated_at<?))").run(iso(),source.id,dayAgo,cutoff);
  this.db.prepare("UPDATE jobs SET state='queued',attempts=0,error='',next_at=? WHERE source_id=? AND state IN ('blocked','error') AND updated_at<?").run(iso(),source.id,dayAgo);
 }
 nextJob(sourceId,{preferRefresh=false,priorityCategories=[]}={}){
  const filter=priorityCategories.length?" AND kind='category' AND category_key IN (SELECT value FROM json_each(?))":'';
  return this.db.prepare("SELECT * FROM jobs WHERE source_id=? AND state IN ('queued','error') AND attempts<3 AND next_at<=?"+filter+" ORDER BY CASE WHEN refresh=? THEN 0 ELSE 1 END,CASE kind WHEN 'discover' THEN 0 WHEN 'directory' THEN 1 ELSE 2 END,position,updated_at,id LIMIT 1").get(sourceId,iso(),...(priorityCategories.length?[JSON.stringify(priorityCategories)]:[]),preferRefresh?1:0);
 }
 usage(sourceId){return Number(this.db.prepare('SELECT pages FROM daily_usage WHERE day=? AND source_id=?').get(iso().slice(0,10),sourceId)?.pages||0)}
 countRequest(sourceId){this.db.prepare('INSERT INTO daily_usage(day,source_id,pages) VALUES(?,?,1) ON CONFLICT(day,source_id) DO UPDATE SET pages=pages+1').run(iso().slice(0,10),sourceId)}
 finishJob(id,error=null){const now=iso();if(error)this.db.prepare("UPDATE jobs SET state=?,attempts=attempts+1,error=?,updated_at=?,next_at=? WHERE id=?").run(error.blocked?'blocked':'error',String(error.message).slice(0,300),now,new Date(Date.now()+15*60000).toISOString(),id);else this.db.prepare("UPDATE jobs SET state='done',error='',updated_at=? WHERE id=?").run(now,id)}
 setSourceStatus(id,status,message=''){this.db.prepare('UPDATE sources SET status=?,message=?,checked_at=? WHERE id=?').run(status,message.slice(0,300),iso(),id)}
 upsertVideo(sourceId,video,category=null){
  const id=video.id||`${sourceId}:${video.externalId}`;const exists=this.db.prepare('SELECT id FROM videos WHERE id=?').get(id),now=iso();
  this.db.prepare(`INSERT INTO videos(id,source_id,external_id,source_url,title,author,thumbnail,duration,created_at,checked_at,manual_data) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source_url=excluded.source_url,title=excluded.title,author=excluded.author,thumbnail=COALESCE(excluded.thumbnail,videos.thumbnail),duration=excluded.duration,checked_at=excluded.checked_at,manual_data=excluded.manual_data,available=1`).run(id,sourceId,String(video.externalId),video.sourceUrl,video.title,video.author||sourceId,video.thumbnail||null,video.duration||'',now,now,video.manualData?JSON.stringify(video.manualData):null);
  if(category)this.db.prepare('INSERT OR IGNORE INTO video_categories(video_id,category_key) VALUES(?,?)').run(id,category);
  return exists?0:1;
 }
 savePage(source,job,parsed){return this.transaction(()=>{
  let added=0,newAssociations=0;
  // Category discovery is restricted to the home and category directory. Listings
  // often contain tag links that should not expand the configured category tree.
  if(job.kind!=='category')for(const category of parsed.categories){const key=this.addCategory(source.id,category);this.enqueue(source.id,category.url,'category',key,0)}
  for(const video of parsed.videos){if(job.category_key&&!this.db.prepare('SELECT video_id FROM video_categories WHERE video_id=? AND category_key=?').get(`${source.id}:${video.externalId}`,job.category_key))newAssociations++;added+=this.upsertVideo(source.id,video,job.category_key)}
  let cycle=false;
  if(job.kind==='category'&&parsed.videos.length){const fingerprint=createHash('sha256').update(parsed.videos.map(v=>v.externalId).sort().join('\n')).digest('hex');const previous=this.db.prepare('SELECT url FROM page_fingerprints WHERE source_id=? AND category_key=? AND fingerprint=?').get(source.id,job.category_key,fingerprint);cycle=Boolean(previous&&previous.url!==job.url);this.db.prepare('INSERT OR IGNORE INTO page_fingerprints(source_id,category_key,fingerprint,url) VALUES(?,?,?,?)').run(source.id,job.category_key,fingerprint,job.url)}
  if(job.kind==='category'&&parsed.next&&!cycle){
   this.enqueue(source.id,parsed.next,'category',job.category_key,job.position+1);
   // Reserve a separate portion of each run for fresh listings. Revisit the
   // head until existing category membership is reached; backfill keeps its turn.
   if(job.refresh&&newAssociations)this.db.prepare("UPDATE jobs SET state='queued',refresh=1,attempts=0,error='',next_at=? WHERE source_id=? AND url=? AND kind='category' AND state='done'").run(iso(),source.id,parsed.next);
  }
  this.finishJob(job.id);return {added,cycle};
 })}
 acquire(owner){return this.transaction(()=>{const now=iso();const lock=this.db.prepare('SELECT * FROM collector_lock WHERE id=1').get();if(lock&&lock.expires_at>now)return false;this.db.prepare('INSERT OR REPLACE INTO collector_lock(id,owner,expires_at) VALUES(1,?,?)').run(owner,new Date(Date.now()+300000).toISOString());return true})}
 heartbeat(owner){this.db.prepare('UPDATE collector_lock SET expires_at=? WHERE id=1 AND owner=?').run(new Date(Date.now()+300000).toISOString(),owner)}
 release(owner){this.db.prepare('DELETE FROM collector_lock WHERE id=1 AND owner=?').run(owner)}
 isCollecting(){return Boolean(this.db.prepare('SELECT id FROM collector_lock WHERE expires_at>?').get(iso()))}
 facets(){
  const categories=this.db.prepare('SELECT c.key,c.name,COUNT(DISTINCT CASE WHEN s.enabled=1 THEN v.id END) AS count FROM categories c LEFT JOIN video_categories vc ON vc.category_key=c.key LEFT JOIN videos v ON v.id=vc.video_id AND v.available=1 LEFT JOIN sources s ON s.id=v.source_id WHERE s.enabled=1 OR EXISTS(SELECT 1 FROM source_categories sc JOIN sources enabled_source ON enabled_source.id=sc.source_id WHERE sc.category_key=c.key AND enabled_source.enabled=1) GROUP BY c.key ORDER BY c.name COLLATE NOCASE').all();
  const sources=this.db.prepare('SELECT s.*,COUNT(v.id) AS count FROM sources s LEFT JOIN videos v ON v.source_id=s.id AND v.available=1 WHERE s.enabled=1 GROUP BY s.id ORDER BY s.name').all();
  return {categories,sources};
 }
 serialize(row){
  const parsed=parseSource(row.source_url),manual=row.manual_data?JSON.parse(row.manual_data):{};
  const categories=this.db.prepare('SELECT c.key,c.name FROM video_categories vc JOIN categories c ON c.key=vc.category_key WHERE vc.video_id=? ORDER BY c.name').all(row.id);
  return {...parsed,...manual,id:row.id,title:row.title,author:row.author,sourceUrl:row.source_url,provider:row.source_id==='manual'?parsed.provider:this.db.prepare('SELECT name FROM sources WHERE id=?').get(row.source_id)?.name,sourceId:row.source_id,thumbnail:row.thumbnail,thumbnailUrl:row.source_id==='manual'?row.thumbnail:`/api/thumbnail?id=${encodeURIComponent(row.id)}`,duration:row.duration,categories,category:categories[0]?.name||'Página inicial',checkedAt:row.checked_at,origin:row.source_id==='manual'?'manual':'collected'};
 }
 query({q='',category='',provider='',sort='discovery',page=1,pageSize=40,ids=null,countOnly=false,snapshot=null}={}){
  q=String(q).slice(0,200);page=Math.max(1,Math.min(100000,Math.floor(Number(page)||1)));pageSize=Math.max(1,Math.min(80,Math.floor(Number(pageSize)||40)));
  // Keep pagination within the records present when this view was opened.
  // Only two row boundaries travel with the requests; no list is persisted.
  if(!snapshot||!Number.isSafeInteger(snapshot.videos)||snapshot.videos<0||!Number.isSafeInteger(snapshot.categories)||snapshot.categories<0)snapshot={videos:this.db.prepare('SELECT COALESCE(MAX(rowid),0) n FROM videos').get().n,categories:this.db.prepare('SELECT COALESCE(MAX(rowid),0) n FROM video_categories').get().n};
  const where=['v.available=1','s.enabled=1','v.rowid<=?'],params=[snapshot.videos];
  const groups=searchGroups(q),categoryNames=groups.length?this.db.prepare('SELECT key,name FROM categories').all().map(item=>({...item,normalized:' '+normalizeText(item.name)+' '})):[];
  for(const group of groups){
   const expression=group.map(term=>'"'+term.replaceAll('"','""')+'"*').join(' OR ');
   const keys=categoryNames.filter(item=>group.some(term=>item.normalized.includes(' '+term+' ')||item.normalized.trim().startsWith(term))).map(item=>item.key);
   where.push('(v.rowid IN (SELECT rowid FROM video_search WHERE video_search MATCH ?) OR EXISTS(SELECT 1 FROM video_categories search_vc WHERE search_vc.video_id=v.id AND search_vc.rowid<=? AND search_vc.category_key IN (SELECT value FROM json_each(?))))');params.push(expression,snapshot.categories,JSON.stringify(keys));
  }
  if(category){where.push('EXISTS(SELECT 1 FROM video_categories vc WHERE vc.video_id=v.id AND vc.category_key=? AND vc.rowid<=?)');params.push(String(category),snapshot.categories)}
  if(provider){where.push('v.source_id=?');params.push(String(provider))}
  if(ids!==null){if(!Array.isArray(ids)||ids.length>1000)throw new Error('Lista de favoritos inválida.');where.push('v.id IN (SELECT value FROM json_each(?))');params.push(JSON.stringify(ids.map(String)))}
  const from='FROM videos v JOIN sources s ON s.id=v.source_id WHERE '+where.join(' AND ');
  const total=Number(this.db.prepare('SELECT COUNT(*) AS n '+from).get(...params).n);
  const metadata={total,page,pageSize,pages:Math.ceil(total/pageSize),snapshot};
  if(countOnly)return metadata;
  // Newest discoveries first; rechecking an existing record does not promote it.
  const order=sort==='title'?'v.title COLLATE NOCASE ASC,v.rowid':category?'(SELECT vc.rowid FROM video_categories vc WHERE vc.video_id=v.id AND vc.category_key=?) DESC,v.rowid DESC':'v.rowid DESC';
  const rows=this.db.prepare('SELECT v.* '+from+' ORDER BY '+order+' LIMIT ? OFFSET ?').all(...params,...(category&&sort!=='title'?[String(category)]:[]),pageSize,(page-1)*pageSize);
  return {...metadata,videos:rows.map(row=>this.serialize(row))};
 }
 status(){const facets=this.facets();return {...facets,totals:{videos:Number(this.db.prepare('SELECT COUNT(*) AS n FROM videos v JOIN sources s ON s.id=v.source_id WHERE s.enabled=1 AND v.available=1').get().n),categories:facets.categories.length,pending:Number(this.db.prepare("SELECT COUNT(*) AS n FROM jobs j JOIN sources s ON s.id=j.source_id WHERE s.enabled=1 AND state IN ('queued','error')").get().n)},lastRun:this.db.prepare('SELECT * FROM collection_runs ORDER BY id DESC LIMIT 1').get()||null}}
 export(){return this.db.prepare('SELECT v.* FROM videos v JOIN sources s ON s.id=v.source_id WHERE s.enabled=1').all().map(row=>this.serialize(row))}
}
