import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  technologies: { type: [String], default: [] },
  github: { type: String, trim: true },
  liveDemo: { type: String, trim: true },
  image: { type: String }, // percorso immagine
}, { timestamps: true });

projectSchema.pre('save', function(next) {
  if (Array.isArray(this.technologies)) {
    this.technologies = this.technologies.map(t => t.trim()).filter(Boolean);
  }
  next();
});

export default mongoose.model('Project', projectSchema);
