import mongoose, {Schema, Document} from "mongoose";

export interface IReview extends Document{
    user: mongoose.Types.ObjectId;
    order?: mongoose.Types.ObjectId
    type: "app" | "delivery";
    rating: number;
    comment: string;
    isHidden: boolean;
    createdAt: Date;
}

const ReviewSchema = new Schema<IReview>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        order: {
            type: Schema.Types.ObjectId,
            ref: "Order"
        },
        type: {
            type: String,
            enum: ["app", "delivery"],
            required: true
        },
        rating: {
            type:Number,
            min: 1,
            max: 5,
            required: true
        },
        comment: {
            type: String,
            required: true
         
        },
        
        isHidden: {
            type: Boolean,
            default: false
        }
    },
    {timestamps:true}
);

export default mongoose.model<IReview>("Review",ReviewSchema);