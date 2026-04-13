import { Request, Response } from "express";
import Review from "../models/Review.model.js";

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