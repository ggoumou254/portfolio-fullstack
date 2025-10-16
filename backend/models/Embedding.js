import mongoose from 'mongoose';


const EmbeddingSchema = new mongoose.Schema({
source: { type: String, enum: ['project'], required: true, index: true },
refId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
chunkId:{ type: String, required: true, index: true },
lang: { type: String, default: 'it', index: true },
text: { type: String, required: true },
vector: { type: [Number], required: true },
vectorDim: { type: Number, index: true, default: 0 },
meta: { type: Object, default: {} },
}, { timestamps: true });


EmbeddingSchema.index({ refId: 1, chunkId: 1 }, { unique: true });


export default mongoose.model('Embedding', EmbeddingSchema);