import { Schema, model } from 'mongoose';

// bookingId, artistId and clientId point at MySQL rows.
const reviewSchema = new Schema(
  {
    bookingId: { type: Number, required: true, unique: true },
    artistId: { type: Number, required: true },
    clientId: { type: Number, required: true },
    score: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: { validator: Number.isInteger, message: 'score must be a whole number' },
    },
    comment: { type: String, trim: true, maxlength: 2000, default: '' },
  },
  { collection: 'reviews', timestamps: { createdAt: true, updatedAt: false } },
);

reviewSchema.index({ artistId: 1, createdAt: -1, _id: -1 });

export const Review = model('Review', reviewSchema);
