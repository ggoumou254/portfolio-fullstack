// backend/scripts/createAdmin.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carica .env dal backend
dotenv.config({ path: path.join(__dirname, '../.env') });

const ADMIN_CONFIG = {
  name: 'Goumou Raphael',
  email: 'ggoumou254.gg@gmail.com',
  role: 'admin',
  status: 'active',
};

const DEFAULT_PASSWORD = 'Raphael1997@'; // fallback dev
const SALT_INFO = 'hash gestito dal modello (pre-save/virtual)';

// Logger
const log = (level, msg, data = {}) => {
  const icon = { info: 'ℹ️', ok: '✅', warn: '⚠️', err: '❌' }[level] || '';
  console[level === 'err' ? 'error' : 'log'](
    `[${new Date().toISOString()}] ${icon} ${msg}`,
    data
  );
};

// Validazione config
const validateConfig = () => {
  const missing = ['MONGO_URI'].filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`Variables d'environnement manquantes: ${missing.join(', ')}`);
  }
  const email = ADMIN_CONFIG.email;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) throw new Error(`Email administrateur invalide: ${email}`);
  log('info', 'Configuration validée avec succès');
};

// Connessione
const connectToDatabase = async () => {
  log('info', 'Tentative de connexion à MongoDB...', {
    uri: process.env.MONGO_URI ? `${process.env.MONGO_URI.split('@')[1]}` : 'non définie'
  });
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
  });
  log('ok', 'Connexion MongoDB établie', {
    host: mongoose.connection.host,
    database: mongoose.connection.name,
  });
};

// Crea/Aggiorna Admin (reimposta sempre la password)
const createOrUpdateAdmin = async () => {
  const adminPassword = process.env.ADMIN_SEED_PASSWORD || DEFAULT_PASSWORD;
  if (adminPassword.length < 8) {
    throw new Error('Le mot de passe administrateur doit contenir au moins 8 caractères');
  }

  const email = ADMIN_CONFIG.email.toLowerCase();
  log('info', 'Début de la création/mise à jour de l’admin', {
    email,
    environment: process.env.NODE_ENV || 'development',
  });

  // cerca admin
  let admin = await User.findOne({ email }).select('+passwordHash');

  if (admin) {
    // aggiorna profilo/ruolo/stato + password
    admin.name = ADMIN_CONFIG.name;
    admin.role = ADMIN_CONFIG.role;
    admin.status = ADMIN_CONFIG.status;

    admin.profile = {
      ...(admin.profile || {}),
      title: 'Administrateur Principal',
      company: 'Portfolio Platform',
      bio: 'Administrateur système créé via script',
    };

    admin.emailVerification = {
      ...(admin.emailVerification || {}),
      isVerified: true,
      verifiedAt: new Date(),
      verificationToken: null,
    };

    admin.security = {
      ...(admin.security || {}),
      lastPasswordChange: new Date(),
      passwordChangeRequired: false,
      failedLoginAttempts: 0,
      lockUntil: null,
    };

    admin.preferences = {
      ...(admin.preferences || {}),
      emailNotifications: {
        newsletter: true,
        projectUpdates: true,
        securityAlerts: true,
        marketing: false,
      },
      language: 'fr',
      timezone: 'Europe/Paris',
      theme: 'auto',
    };

    // imposta NUOVA password (raw); il modello la hasha
    admin.passwordHash = adminPassword;

    await admin.save();

    log('ok', 'Administrateur mis à jour avec succès', {
      userId: admin.id,
      role: admin.role,
      status: admin.status,
      hash: SALT_INFO,
    });

    return {
      action: 'updated',
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        status: admin.status,
        createdAt: admin.createdAt,
      },
      credentials: { email, password: adminPassword },
    };
  }

  // crea nuovo admin (password raw -> hash nel pre-save)
  admin = await User.create({
    name: ADMIN_CONFIG.name,
    email,
    passwordHash: adminPassword,
    role: ADMIN_CONFIG.role,
    status: ADMIN_CONFIG.status,
    profile: {
      title: 'Administrateur Principal',
      company: 'Portfolio Platform',
      bio: 'Administrateur système créé via script',
    },
    emailVerification: {
      isVerified: true,
      verifiedAt: new Date(),
    },
    security: {
      lastPasswordChange: new Date(),
      passwordChangeRequired: false,
      failedLoginAttempts: 0,
      lockUntil: null,
    },
    preferences: {
      emailNotifications: {
        newsletter: true,
        projectUpdates: true,
        securityAlerts: true,
        marketing: false,
      },
      language: 'fr',
      timezone: 'Europe/Paris',
      theme: 'auto',
    },
    metadata: {
      registrationSource: 'script-creation',
      createdBy: 'createAdmin.js',
      creationDate: new Date(),
    },
    tags: ['admin', 'script-created'],
  });

  log('ok', 'Nouvel administrateur créé avec succès', {
    userId: admin.id,
    email: admin.email,
    role: admin.role,
  });

  return {
    action: 'created',
    user: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      status: admin.status,
      createdAt: admin.createdAt,
    },
    credentials: {
      email: admin.email,
      password: adminPassword,
      note: 'Conservez ces informations de connexion en lieu sûr',
    },
  };
};

// Main
const main = async () => {
  try {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Par sécurité, ce script ne doit pas être exécuté en production.');
    }

    validateConfig();
    await connectToDatabase();
    const result = await createOrUpdateAdmin();

    console.log('\n' + '='.repeat(60));
    console.log('📊 RAPPORT DE CRÉATION ADMINISTRATEUR');
    console.log('='.repeat(60));
    console.log(`🔹 Action: ${result.action === 'created' ? 'Création' : 'Mise à jour'}`);
    console.log(`🔹 Email: ${result.user.email}`);
    console.log(`🔹 Rôle: ${result.user.role}`);
    console.log(`🔹 Statut: ${result.user.status}`);
    console.log(`🔹 ID: ${result.user.id}`);
    if (result.credentials) {
      console.log('\n🔐 INFORMATIONS DE CONNEXION:');
      console.log(`   Email: ${result.credentials.email}`);
      console.log(`   Mot de passe: ${result.credentials.password}`);
      if (result.credentials.note) console.log(`   📝 ${result.credentials.note}`);
    }
    console.log('\n✅ Opération terminée avec succès!');
    console.log('='.repeat(60) + '\n');
  } catch (error) {
    log('err', "Échec de l'opération de création admin", { message: error.message, stack: error.stack });
    console.error('\n❌ L\'opération a échoué. Vérifiez les logs ci-dessus pour plus de détails.\n');
    process.exit(1);
  } finally {
    try {
      await mongoose.disconnect();
      log('info', 'Connexion MongoDB fermée');
    } catch (e) {
      log('warn', 'Erreur lors de la fermeture de la connexion MongoDB', { message: e.message });
    }
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('❌ Erreur non gérée dans le script:', err);
    process.exit(1);
  });
}

export { createOrUpdateAdmin, validateConfig };
