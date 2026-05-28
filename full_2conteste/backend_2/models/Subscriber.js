import mongoose from 'mongoose';

const subscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true, // questo basta
      lowercase: true,
      trim: true,
      match: [/.+@.+\..+/, 'Email non valida'],
    },
  },
  { timestamps: true }
);

export default mongoose.model('Subscriber', subscriberSchema);
