import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { USERNAME_RULES } from '../utils/authValidation.js';

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    unique: true,
    index: true
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    validate: {
      validator(value) {
        const username = String(value || '').trim();
        if (!this.isNew && !this.isModified('username')) {
          return true;
        }

        return (
          username.length >= USERNAME_RULES.minLength &&
          username.length <= USERNAME_RULES.maxLength &&
          USERNAME_RULES.regex.test(username)
        );
      },
      message: USERNAME_RULES.invalidMessage
    }
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please enter a valid email address'
    ]
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false // Don't return password in queries by default
  },
  avatar: {
    type: String,
    default: 'https://via.placeholder.com/150'
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'moderator'],
    default: 'user'
  },
  rank: {
    type: String,
    enum: ['client', 'rich client', 'top client', 'ruby rich', 'whale', 'moderator', 'manager', 'admin', 'owner', 'developer'],
    default: 'client'
  },
  xp: {
    type: Number,
    default: 0,
    min: 0
  },
  passes: {
    type: Number,
    default: 0,
    min: 0
  },
  totalUSDValue: {
    type: Number,
    default: 0,
    min: 0
  },
  totalDeals: {
    type: Number,
    default: 0,
    min: 0
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date
  },
  lastChatView: {
    type: Date,
    default: null
  },
  chatModeration: {
    isMuted: {
      type: Boolean,
      default: false
    },
    mutedUntil: {
      type: Date,
      default: null
    },
    mutedReason: {
      type: String,
      default: null
    },
    mutedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    isBanned: {
      type: Boolean,
      default: false
    },
    bannedUntil: {
      type: Date,
      default: null
    },
    bannedReason: {
      type: String,
      default: null
    },
    bannedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  passwordReset: {
    codeHash: {
      type: String
    },
    expiresAt: {
      type: Date
    },
    attempts: {
      type: Number,
      default: 0
    },
    lastSentAt: {
      type: Date
    },
    resetTokenHash: {
      type: String
    },
    resetTokenExpiresAt: {
      type: Date
    }
  },
  twoFactor: {
    enabled: {
      type: Boolean,
      default: false
    },
    codeHash: {
      type: String
    },
    expiresAt: {
      type: Date
    },
    attempts: {
      type: Number,
      default: 0
    },
    lastSentAt: {
      type: Date
    },
    verifiedAt: {
      type: Date
    },
    loginSessionTokenHash: {
      type: String
    },
    loginSessionTokenExpiresAt: {
      type: Date
    }
  },
  emailChange: {
    pendingEmail: {
      type: String,
      lowercase: true,
      trim: true
    },
    currentCodeHash: {
      type: String
    },
    currentCodeExpiresAt: {
      type: Date
    },
    currentCodeAttempts: {
      type: Number,
      default: 0
    },
    currentCodeLastSentAt: {
      type: Date
    },
    currentVerifiedAt: {
      type: Date
    },
    newCodeHash: {
      type: String
    },
    newCodeExpiresAt: {
      type: Date
    },
    newCodeAttempts: {
      type: Number,
      default: 0
    },
    newCodeLastSentAt: {
      type: Date
    },
    sessionTokenHash: {
      type: String
    },
    sessionTokenExpiresAt: {
      type: Date
    }
  },
  customStickers: [{
    id: String,
    name: String,
    data: String, // Base64 data URL
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  discord: {
    connected: {
      type: Boolean,
      default: false
    },
    userId: {
      type: String,
      default: null
    },
    username: {
      type: String,
      default: null
    },
    discriminator: {
      type: String,
      default: null
    },
    globalName: {
      type: String,
      default: null
    },
    avatar: {
      type: String,
      default: null
    },
    guildMember: {
      type: Boolean,
      default: false
    },
    guildRoles: {
      type: [String],
      default: []
    },
    syncedRoleId: {
      type: String,
      default: null
    },
    syncedSiteRole: {
      type: String,
      default: null
    },
    syncStatus: {
      type: String,
      enum: ['never', 'synced', 'skipped', 'pending_guild_join', 'failed'],
      default: 'never'
    },
    syncMessage: {
      type: String,
      default: null
    },
    connectedAt: {
      type: Date,
      default: null
    },
    lastSyncedAt: {
      type: Date,
      default: null
    }
  }
}, {
  timestamps: true // Adds createdAt and updatedAt fields
});

userSchema.index(
  { 'discord.userId': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'discord.userId': { $type: 'string' }
    }
  }
);

// Generate unique user ID before saving
userSchema.pre('save', async function(next) {
  // Only generate userId if it doesn't exist (for new users)
  if (!this.userId) {
    // Generate a unique 17-digit numeric ID
    this.userId = Math.floor(Math.random() * 90000000000000000) + 10000000000000000;
  }
  next();
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password for login
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Method to generate user response (without sensitive data)
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.__v;
  return user;
};

const User = mongoose.model('User', userSchema);

export default User;
