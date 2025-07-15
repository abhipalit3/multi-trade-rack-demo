// nav.js

const burger   = document.getElementById('burger');
const mobile   = document.getElementById('mobileMenu');
const closeBtn = document.getElementById('closeBtn');

burger.addEventListener('click', () => {
  mobile.classList.add('open');
});

closeBtn.addEventListener('click', () => {
  mobile.classList.remove('open');
});
