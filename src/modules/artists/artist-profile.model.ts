import { Schema, model } from 'mongoose';

const artistProfileSchema = new Schema(
  {
    userId: { type: Number, required: true, unique: true },
    displayName: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    bio: { type: String, trim: true, default: '' },
    hourlyRateCents: { type: Number, min: 0 },
    genres: { type: [String], default: [] },
    city: { type: String, trim: true },
  },
  { collection: 'artist_profiles', timestamps: true },
);

artistProfileSchema.index({ category: 1 });

export const ArtistProfile = model('ArtistProfile', artistProfileSchema);
