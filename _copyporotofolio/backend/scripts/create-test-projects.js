// backend/scripts/create-test-projects.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Project from '../models/Project.js';

dotenv.config();

const testProjects = [
  {
    title: "Portfolio Website",
    description: "Sito portfolio personale con React e Node.js",
    technologies: ["React", "Node.js", "MongoDB", "Express"],
    status: "published",
    featured: true
  },
  {
    title: "E-commerce Platform",
    description: "Piattaforma e-commerce completa",
    technologies: ["Vue.js", "Python", "PostgreSQL", "Django"],
    status: "published",
    featured: false
  },
  {
    title: "Mobile App",
    description: "Applicazione mobile cross-platform",
    technologies: ["React Native", "Firebase", "JavaScript"],
    status: "published",
    featured: true
  }
];

async function createTestProjects() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connesso al database');
    
    await Project.deleteMany({});
    console.log('✅ Vecchi progetti eliminati');
    
    const projects = await Project.insertMany(testProjects);
    console.log(`✅ ${projects.length} progetti di test creati`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Errore:', error);
    process.exit(1);
  }
}

createTestProjects();