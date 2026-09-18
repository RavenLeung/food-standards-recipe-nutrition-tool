const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const defaultDataset = path.join(root, 'data', 'NPC 2026 - Nutrient profiles(per 100 g).csv');
const developmentDataset = path.join(root, '..', 'NPC 2026 - Nutrient profiles(per 100 g).csv');
const nutrientDataset = process.env.NUTRIENT_DATASET || (fs.existsSync(defaultDataset) ? defaultDataset : developmentDataset);
const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/data/nutrients.csv': [nutrientDataset, 'text/csv; charset=utf-8']
};

http.createServer((req, res) => {
  const requested = (req.url || '/').split('?')[0];
  const entry = files[requested];
  if (!entry) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  const filePath = requested === '/data/nutrients.csv' ? entry[0] : path.join(root, entry[0]);
  fs.readFile(filePath, (error, body) => {
    if (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(`Cannot read ${entry[0]}: ${error.message}`);
    }
    res.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store' });
    res.end(body);
  });
}).listen(4173, '127.0.0.1', () => {
  console.log('Nutrition tool running at http://127.0.0.1:4173');
});
