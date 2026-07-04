const mongoose = require('mongoose');

const uri = "mongodb+srv://ashishmeenawi_db_user:lg65gMj6QVZf5zWW@ecd-cluster.j8bswp0.mongodb.net/ECD_db?retryWrites=true&w=majority&appName=ECD-Cluster";

const couponSchema = new mongoose.Schema({}, { strict: false });
const Coupon = mongoose.model('Coupon', couponSchema);

async function test() {
  await mongoose.connect(uri);
  console.log("Connected to MongoDB");
  
  const allCoupons = await Coupon.find({});
  console.log("All coupons count:", allCoupons.length);
  
  const now = new Date();
  const query = {
      active: true,
      $or: [{ validTo: { $gte: now } }, { validTo: null }],
      $expr: {
          $or: [
              { $eq: ["$usageLimit", null] },
              { $lt: ["$usedCount", "$usageLimit"] }
          ]
      }
  };
  query.$and = [
      { $or: [{ restaurantId: null }, { restaurantId: undefined }] },
  ];
  
  const activeCoupons = await Coupon.find(query);
  console.log("Active coupons with exact backend query:", activeCoupons.length);
  
  console.log("All coupons dump:", JSON.stringify(allCoupons, null, 2));

  mongoose.disconnect();
}
test().catch(console.error);
