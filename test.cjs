const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb+srv://ashishmeenawi_db_user:lg65gMj6QVZf5zWW@ecd-cluster.j8bswp0.mongodb.net/ECD_db?retryWrites=true&w=majority&appName=ECD-Cluster');
  
  const Restaurant = mongoose.model('Restaurant', new mongoose.Schema({}, { strict: false }));
  const dbMall = await Restaurant.findOne({ name: /DB mall/i });
  console.log("DB mall:", dbMall);
  process.exit(0);
}
test();
