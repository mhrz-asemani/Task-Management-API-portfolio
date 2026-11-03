import multer from 'multer';

// store the file in memory temporarily, so we can forward it to Cloudinary
const storage = multer.memoryStorage();
export const upload = multer({ storage });