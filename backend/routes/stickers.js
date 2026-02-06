import express from 'express';
import User from '../models/User.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Get user's custom stickers
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('customStickers');
    res.json(user.customStickers || []);
  } catch (error) {
    console.error('Error fetching stickers:', error);
    res.status(500).json({ message: 'Failed to fetch stickers' });
  }
});

// Add custom sticker
router.post('/', protect, async (req, res) => {
  try {
    const { id, name, data } = req.body;

    // Validate data
    if (!id || !name || !data) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Validate base64 data URL
    if (!data.startsWith('data:image/')) {
      return res.status(400).json({ message: 'Invalid image data' });
    }

    // Check data size (max 1MB for base64 string)
    if (data.length > 1024 * 1024) {
      return res.status(400).json({ message: 'Image too large (max 1MB)' });
    }

    const user = await User.findById(req.user._id);

    // Check sticker limit (max 50 custom stickers per user)
    if (user.customStickers && user.customStickers.length >= 50) {
      return res.status(400).json({ message: 'Maximum 50 custom stickers allowed' });
    }

    // Add sticker
    user.customStickers = user.customStickers || [];
    user.customStickers.push({
      id,
      name,
      data,
      createdAt: new Date()
    });

    await user.save();

    res.json({ message: 'Sticker added', stickers: user.customStickers });
  } catch (error) {
    console.error('Error adding sticker:', error);
    res.status(500).json({ message: 'Failed to add sticker' });
  }
});

// Delete custom sticker
router.delete('/:stickerId', protect, async (req, res) => {
  try {
    const { stickerId } = req.params;

    const user = await User.findById(req.user._id);
    
    if (!user.customStickers) {
      return res.status(404).json({ message: 'No stickers found' });
    }

    // Remove sticker
    user.customStickers = user.customStickers.filter(s => s.id !== stickerId);
    await user.save();

    res.json({ message: 'Sticker deleted', stickers: user.customStickers });
  } catch (error) {
    console.error('Error deleting sticker:', error);
    res.status(500).json({ message: 'Failed to delete sticker' });
  }
});

// Clear all custom stickers
router.delete('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.customStickers = [];
    await user.save();

    res.json({ message: 'All stickers cleared' });
  } catch (error) {
    console.error('Error clearing stickers:', error);
    res.status(500).json({ message: 'Failed to clear stickers' });
  }
});

export default router;
