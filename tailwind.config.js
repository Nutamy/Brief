// Build: node build.mjs
module.exports = {
  content: ['./index.html', './assets/brief.js'],
  theme:  { extend: {
    colors: {
      paper:'#FAF6EE', cream:'#F1EADB', ink:'#181410',
      line:'#E6DEC9', gold:'#C89A3C', gold2:'#E2B75C', golddeep:'#A67C28',
      mut:'#6F6553', mutd:'#A99F8C', green:'#3E9B5F'
    },
    fontFamily: { disp:['Unbounded','sans-serif'], sans:['Manrope','sans-serif'] }
  }}
};
