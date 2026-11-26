const map = L.map('map').setView([40.4,-82.9], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM' }).addTo(map);
let cameras = [];
let markers = {};

function haversine(a,b){const R=6371;const dLat=(b.lat-a.lat)*Math.PI/180;const dLng=(b.lng-a.lng)*Math.PI/180;const x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}

async function loadCameras(){
  const r = await fetch('/api/cameras');
  const data = await r.json();
  cameras = Array.isArray(data) ? data : (data.cameras||data.items||[]);
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  for (const c of cameras){
    const m = L.marker([c.lat,c.lng]).addTo(map).bindPopup(c.name||'cam');
    markers[c.id] = m;
    const card = document.createElement('div'); card.className='card'; card.id='card-'+c.id;
    card.innerHTML = `<img src="${c.imageUrl||''}" alt=""/><div class="meta">${c.name||c.id}</div>`;
    grid.appendChild(card);
  }
}

function nearest(lat,lng){
  let best=null,bestD=Infinity;
  for(const c of cameras){const d=haversine({lat,lng},{lat:c.lat,lng:c.lng});if(d<bestD){bestD=d;best=c;}}
  return best;
}

function showBanner(text){const b=document.getElementById('banner');b.textContent=text;b.classList.add('show');setTimeout(()=>b.classList.remove('show'),8000);}

const es = new EventSource('/events');
es.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if(msg.type==='call'){
    const c = msg.call;
    const lat = c.lat ?? c.latitude; const lng = c.lng ?? c.longitude;
    if(lat!=null && lng!=null){
      const n = nearest(lat,lng);
      if(n){ showBanner(`Radio call -> nearest camera: ${n.name||n.id}`); const m=markers[n.id]; if(m) m.openPopup(); }
    }
  }
};

loadCameras().catch(console.error);
