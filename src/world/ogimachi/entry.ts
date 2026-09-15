const params=new URLSearchParams(window.location.search);
if(params.has('story')||params.has('play')||params.get('view')==='detail')void import('./preview');
else void import('./designPreview');
