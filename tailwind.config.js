// Build: node build.mjs
module.exports = {
  content: ['./index.html', './assets/brief.js'],
  theme:  { extend: {
    // Liquid Glass palette of the main site. Legacy token names are kept: markup and i18n fragments use them
    colors: {
      paper:'#F5F7FA', cream:'#EEF0F5', ink:'#141A21',
      line:'#D6DEE8', gold:'#7164F5', gold2:'#8DE8E2', golddeep:'#4B3FD6',
      mut:'#48515C', mutd:'#5E6975', green:'#2F9E6A'
    },
    fontFamily: { disp:['Unbounded','sans-serif'], sans:['var(--f-sans)'] }
  }}
};
