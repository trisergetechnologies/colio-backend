import mongoose from 'mongoose';
import chalk from 'chalk';
import dotenv from 'dotenv';
import Settings from '../models/Setting.js';

dotenv.config();

const connectDB = async () => {
  const env = process.env.NODE_ENV || 'development';

  const mongoURI =
    env === 'production'
      ? process.env.MONGO_URI_PROD
      : process.env.MONGO_URI_DEV;

  try {
    const conn = await mongoose.connect(mongoURI);
    await Settings.getSettings(process.env.NODE_ENV || 'development');
    console.log(chalk.greenBright(`✔ MongoDB Connected (${env}): ${conn.connection.host}`));
  } catch (error) {
    console.log(chalk.redBright(`✖ DB Connection Error (${env}): ${error.message}`));
    process.exit(1);
  }
};

export default connectDB;
