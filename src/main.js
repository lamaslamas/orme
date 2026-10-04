import './stile.css';

const app = document.getElementById('app');

function mostra() {
  app.innerHTML = '<p class="vuoto">Orme è in costruzione.</p>';
}

window.addEventListener('hashchange', mostra);
mostra();
