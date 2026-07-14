import { Request, Response } from "express";
import Review from "../models/Review.model.js";
import Restaurant from "../models/Restaurant.model.js";
import Order from "../models/Order.model.js";

// Create review
export const createReview = async (req: Request, res: Response ) => {
    const userId = req.user.id;
    const { type, rating, comment, orderId} = req.body;

    const review = await Review.create({
        user: userId,
        order: orderId || null,
        type, 
        rating,
        comment,
        isHidden: false,
    });

    res.status(201).json({
        message: "Review submitted successfully",
        review
    });
};

// get all review  for Admin only
export const getAllReviews = async (req: Request, res: Response) => {
    const { type } = req.query;
    const query: any = {}
    if (type) query.type = type;

    const reviews = await Review.find(query)
       .populate("user","name phone")
       .populate("order")
       .sort({createAt: -1});
    
    res.json(reviews);
    

};

// get my review (user)

export const getMyReviews = async (req: Request, res:Response) => {
    const userId = req.user.id;

    const reviews = await Review.find({
        user: userId
    }).sort({ CreateAt: -1});

    res.json(reviews);
};

// Delete my Review( user)
export const deleteMyReview = async (req: Request, res: Response) => {
    const userId = req.user.id;
    const { reviewId } = req.params;


const review = await Review.findOne({
    _id: reviewId,
    user: userId
});

if (!review)
    return res.status(404).json({message:"Review not found"});

await review.deleteOne();

res.json({massage: "Review deleted successfully"});
};

// admin - Hide Review (Shadow)
export const hideReview = async (req: Request, res: Response) => {
  const { reviewId } = req.params;

  const review = await Review.findByIdAndUpdate(
    reviewId,
    { isHidden: true },
    { new: true }
  );

  if (!review)
    return res.status(404).json({ message: "Review not found" });

  res.json({ message: "Review hidden successfully!", review });
};

// Adnin - delete review
export const deleteReview = async (req: Request, res: Response) => {
    const {reviewId} = req.params;

    const review = await Review.findByIdAndDelete(reviewId);
    if(!review)
        return res.status(404).json({message:"Review not found"});

    res.json({ message:"Review delated by admin successfully"});

};

// Add Restaurant Review (user)
export const addRestaurantReview = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = req.user.id;
        const { orderId, restaurantId, rating, comment } = req.body;

        // Verify order belongs to user, is for this restaurant, and is delivered
        const order = await Order.findOne({ _id: orderId, customer: userId, store: restaurantId, status: "delivered" });
        if (!order) {
            return res.status(400).json({ message: "You can only review restaurants after a completed delivery." });
        }

        // Check if review already exists for this order
        const existingReview = await Review.findOne({ order: orderId, type: "restaurant" });
        if (existingReview) {
            return res.status(400).json({ message: "You have already reviewed this order." });
        }

        const review = await Review.create({
            user: userId,
            order: orderId,
            restaurant: restaurantId,
            type: "restaurant",
            rating,
            comment,
            isHidden: false,
        });

        // Recalculate average rating for the restaurant
        const allReviews = await Review.find({ restaurant: restaurantId, type: "restaurant", isHidden: false });
        const totalReviews = allReviews.length;
        const avgRating = totalReviews > 0 ? allReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews : 0;

        await Restaurant.findByIdAndUpdate(restaurantId, {
            totalReviews,
            avgRating: parseFloat(avgRating.toFixed(1))
        });

        res.status(201).json({ message: "Review submitted successfully", review });
    } catch (error) {
        res.status(500).json({ message: "Error submitting review", error });
    }
};

// Get all visible reviews for a restaurant
export const getRestaurantReviews = async (req: Request, res: Response): Promise<any> => {
    try {
        const { restaurantId } = req.params;
        const reviews = await Review.find({ restaurant: restaurantId, type: "restaurant", isHidden: false })
            .populate("user", "name phone avatar")
            .sort({ createdAt: -1 });
        res.json(reviews);
    } catch (error) {
        res.status(500).json({ message: "Error fetching reviews", error });
    }
};