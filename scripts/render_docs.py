from pathlib import Path
import html,re
root=Path(__file__).resolve().parents[1]
def inline(s):
 s=html.escape(s)
 s=re.sub(r'`([^`]+)`',r'<code>\1</code>',s)
 s=re.sub(r'https://[^\s<>]+',lambda m:'<a href="'+m[0]+'" rel="noopener noreferrer">'+m[0]+'</a>',s)
 return s

def render(text):
 out=[];code=[];in_code=False;in_list=False
 for line in text.splitlines():
  if line.startswith('```'):
   if in_code:out.append('<pre><code>'+html.escape('\n'.join(code))+'</code></pre>');code=[]
   in_code=not in_code;continue
  if in_code:code.append(line);continue
  is_list=bool(re.match(r'^(?:- |\d+\. )',line))
  if in_list and not is_list:out.append('</ul>');in_list=False
  if is_list:
   if not in_list:out.append('<ul>');in_list=True
   out.append('<li>'+inline(re.sub(r'^(?:- |\d+\. )','',line))+'</li>');continue
  if line.startswith('#'):
   n=min(len(line)-len(line.lstrip('#')),6);out.append(f'<h{n}>'+inline(line[n:].strip())+f'</h{n}>')
  elif line.strip():out.append('<p>'+inline(line)+'</p>')
 if in_list:out.append('</ul>')
 return '\n'.join(out)
for name,title,source in [('manual','Manual de indexação','MANUAL-DE-INDEXACAO.md'),('especificacao','Especificação do MVP','ESPECIFICACAO-MVP.md')]:
 text=(root/'docs'/source).read_text()
 page=f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} — Dojo Atlas</title><link rel="stylesheet" href="style.css"></head><body><header class="header"><a class="brand" href="index.html">dojo<span>atlas</span></a><nav><a href="index.html">Voltar ao catálogo</a><a href="manual.html">Manual</a><a href="especificacao.html">Plano do produto</a></nav></header><main class="article">'+render(text)+'</main></body></html>'
 (root/'public'/f'{name}.html').write_text(page)
