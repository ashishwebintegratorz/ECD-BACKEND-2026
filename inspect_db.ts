import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const test = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ecdkart');
        const count = await mongoose.connection.db!.collection('restaurants').countDocuments();
        const activeCount = await mongoose.connection.db!.collection('restaurants').countDocuments({ isActive: true });
        console.log(`Total restaurants: ${count}`);
        console.log(`Active restaurants: ${activeCount}`);
        
        const oneRest = await mongoose.connection.db!.collection('restaurants').findOne();
        if (oneRest) {
            console.log("Sample restaurant:");
            console.log(`name: ${oneRest.name}`);
            console.log(`isActive: ${oneRest.isActive}`);
            console.log(`menu length: ${oneRest.menu?.length}`);
            console.log(`location:`, JSON.stringify(oneRest.location));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
};

test();
