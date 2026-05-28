import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();
await mongoose.connect(process.env.MONGO_URI);

const email = 'ggoumou254.gg@gmail.com';
const password = await bcrypt.hash('Raphael1997@', 10);

const existing = await User.findOne({ email });
if (existing) {
  console.log('Admin già esistente:', email);
} else {
  await User.create({
    name: 'Goumou Raphael',
    email,
    password,
    role: 'admin',
  });
  console.log('Admin creato:', email);
}

await mongoose.disconnect();
