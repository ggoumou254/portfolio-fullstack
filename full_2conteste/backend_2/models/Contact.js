import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/.+@.+\..+/, 'Email non valida'],
      index: true,
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000,
      trim: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Contact', contactSchema);
