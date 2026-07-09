import mongoose from "mongoose";
import dotenv from "dotenv";
import Restaurant from "./models/Restaurant.model.js";

dotenv.config();

const test = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ecdkart');
        
        const filter = { isActive: true };
        console.log("Running query with filter:", filter);
        const restaurants = await Restaurant.find(filter)
                .select("-menu")
                .sort({ featured: -1, adminRating: -1, orderCount: -1 })
                .skip(0)
                .limit(100)
                .lean();
                
        console.log("Result length:", restaurants.length);
        if (restaurants.length > 0) {
            console.log("First result:", restaurants[0].name);
        } else {
            console.log("NO RESULTS!");
            
            // Check without sort
            const withoutSort = await Restaurant.find(filter).select("-menu").limit(10).lean();
            console.log("Without sort length:", withoutSort.length);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
};

test();
