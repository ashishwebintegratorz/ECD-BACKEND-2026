import mongoose from "mongoose";

const MONGO_URI = "mongodb+srv://ashishmeenawi_db_user:lg65gMj6QVZf5zWW@ecd-cluster.j8bswp0.mongodb.net/ECD_db?retryWrites=true&w=majority&appName=ECD-Cluster";

const RestaurantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  restaurantKey: { type: String, required: true, unique: true },
  storeType: { type: String, enum: ["restaurant", "grocery"], default: "restaurant" },
  status: { type: String, enum: ["active", "inactive", "pending"], default: "active" },
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true }, // [longitude, latitude]
  },
  address: { type: String, required: true },
  phone: { type: String, required: true },
  logo: { type: String },
  banner: { type: String },
  preparationTime: { type: Number, default: 30 },
  averageCost: { type: Number, default: 200 },
  adminRating: { type: Number, default: 4.5 },
  walletBalance: { type: Number, default: 0 },
});

const Restaurant = mongoose.model("Restaurant", RestaurantSchema);

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB.");
    
    // Check if it already exists
    let rest = await Restaurant.findOne({ restaurantKey: "12345678901234" });
    if (rest) {
      console.log("✅ Test restaurant already exists! You can log in.");
    } else {
      rest = new Restaurant({
        name: "Test ECD Restaurant",
        slug: "test-ecd-restaurant-" + Date.now(),
        restaurantKey: "12345678901234",
        storeType: "restaurant",
        status: "active",
        location: { type: "Point", coordinates: [75.8577, 22.7196] }, // Indore
        address: "Test Address, Indore",
        phone: "9999999999",
        walletBalance: 0,
      });
      await rest.save();
      console.log("🚀 Test Restaurant successfully created in the Database! You can now log in.");
    }
  } catch (e) {
    console.error(e);
  } finally {
    mongoose.disconnect();
  }
}
seed();
