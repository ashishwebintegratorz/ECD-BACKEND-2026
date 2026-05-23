import mongoose from "mongoose";
import Order from "./models/Order.model.js";
import Cart from "./models/Cart.model.js";

async function run() {
  await mongoose.connect("mongodb+srv://ashishmeenawi_db_user:lg65gMj6QVZf5zWW@ecd-cluster.j8bswp0.mongodb.net/ECD_db?retryWrites=true&w=majority&appName=ECD-Cluster");
  
  const result = await Order.deleteMany({ "items.name": "Dummy Product" });
  console.log("Deleted dummy product orders: ", result.deletedCount);
  
  const result2 = await Order.deleteMany({ "store": "69ef47bf77c29363016a95e5" });
  console.log("Deleted dummy store orders: ", result2.deletedCount);

  // Clear any dummy items from carts
  const carts = await Cart.find();
  for (const cart of carts) {
    const originalLength = cart.items.length;
    cart.items = cart.items.filter(item => item.name !== "Dummy Product");
    if (cart.items.length !== originalLength) {
      await cart.save();
    }
  }
  console.log("Cleaned up carts");
  
  process.exit(0);
}

run();
