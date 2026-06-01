import mongoose, { Document, Schema } from "mongoose";

export interface IDeliverySetting extends Document {
    morningShift: {
        riderFeePerKm: number;
        adminCommissionPerKm: number;
    };
    nightShift: {
        riderFeePerKm: number;
        adminCommissionPerKm: number;
    };
    isCodEnabled: boolean;
}

const DeliverySettingSchema: Schema = new Schema(
    {
        morningShift: {
            riderFeePerKm: { type: Number, required: true, default: 10 },
            adminCommissionPerKm: { type: Number, required: true, default: 2 },
        },
        nightShift: {
            riderFeePerKm: { type: Number, required: true, default: 12 },
            adminCommissionPerKm: { type: Number, required: true, default: 3 },
        },
        isCodEnabled: { type: Boolean, default: true }
    },
    { timestamps: true }
);

const DeliverySetting = mongoose.model<IDeliverySetting>("DeliverySetting", DeliverySettingSchema);
export default DeliverySetting;
