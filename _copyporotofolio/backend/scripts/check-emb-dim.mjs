import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGO_URI;
await mongoose.connect(uri);

const result = await mongoose.connection.db.collection('embeddings').aggregate([
  { $group: { _id: "$vectorDim", count: { $sum: 1 } } }
]).toArray();

console.log(result);
await mongoose.disconnect();
