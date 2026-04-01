const fs = require('fs');
const pngToIco = require('png-to-ico');

pngToIco('icons/Leaf.png')
  .then(buf => {
    fs.writeFileSync('icons/Leaf.ico', buf);
    console.log('Icon converted to icons/Leaf.ico successfully.');
  })
  .catch(console.error);
