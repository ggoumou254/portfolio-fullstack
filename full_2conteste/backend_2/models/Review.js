import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: true } // createdAt, updatedAt
);

export default mongoose.model('Review', reviewSchema);
