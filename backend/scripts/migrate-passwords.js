// backend/scripts/migrate-passwords.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/portfolio';

(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connesso a Mongo');

    const toFix = await User.find({
      $or: [{ passwordHash: { $exists: false } }, { passwordHash: null }]
    }).lean();

    console.log('Utenti da migrare:', toFix.length);

    const TEMP_PASS = 'Password@123';
    const hash = await bcrypt.hash(TEMP_PASS, 12);

    for (const u of toFix) {
      await User.updateOne(
        { _id: u._id },
        {
          $set: {
            passwordHash: hash,
            'security.lastPasswordChange': new Date(),
            'security.passwordChangeRequired': true
          }
        }
      );
      console.log(`→ ${u.email} migrato (password provvisoria: ${TEMP_PASS})`);
    }

    await mongoose.disconnect();
    console.log('✅ Migrazione completata');
    process.exit(0);
  } catch (e) {
    console.error('❌ Errore migrazione:', e);
    process.exit(1);
  }
})();
