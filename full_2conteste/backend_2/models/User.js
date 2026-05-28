import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true, // 👈 questo basta
      lowercase: true,
      trim: true,
      match: [/.+@.+\..+/, 'Email non valida'],
    },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  { timestamps: true }
);

// Nascondi password in output JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject({ virtuals: true });
  delete obj.password;
  return obj;
};

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
