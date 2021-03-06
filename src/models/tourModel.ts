import mongoose from 'mongoose';
import slugify from 'slugify';
import { IUser } from './userModel';

type TDifficulty = 'easy' | 'medium' | 'difficult';

interface ITourSchema extends mongoose.Document {
  name: string;
  slug: string;
  duration: number;
  maxGroupSize: number;
  difficulty: TDifficulty;
  ratingsAverage: number;
  ratingsQuantity?: number;
  price: number;
  priceDiscount?: number;
  summary: string;
  description?: string;
  images?: [string];
  createdAt?: Date;
  startDates?: [Date];
  secretTour?: boolean;
  startLocation?: {
    type: string;
    coordinates: number[];
    description: string;
    address: string;
  };
  locations?: [
    {
      type: string;
      coordinates: number[];
      address: string;
      description: string;
      day: number;
    }
  ];
}

interface ITourBase extends ITourSchema {
  // Virtuals and schema methods
  durationWeeks: number;
  reviews: mongoose.Schema.Types.ObjectId;
}

export interface ITour extends ITourBase {
  guides: [IUser['_id']];
}

export interface ITourPopulated extends ITourBase {
  guides: [IUser];
}

export interface ITourModel extends mongoose.Model<ITour> {}

const tourSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'A tour must have a name'],
      unique: true,
      trim: true,
      maxlength: [40, 'A tour name must not be more than 40 characters'],
      minlength: [10, 'A tour name must have at least 10 characters']
    },
    slug: {
      type: String
    },
    duration: {
      type: Number,
      required: [true, 'A tour must have a duration']
    },
    maxGroupSize: {
      type: Number,
      required: [true, 'A tour must have a group size']
    },
    difficulty: {
      type: String,
      required: [true, 'A tour must have a difficulty'],
      enum: {
        values: ['easy', 'medium', 'difficult'],
        message: 'Difficulty is either easy, medium or difficult'
      }
    },
    ratingsAverage: {
      type: Number,
      default: 4.5,
      min: [1, 'Rating must be above 1.0'],
      max: [5, 'Rating must be below 5.0'],
      set: (val: number) => Math.round(val * 10) / 10
    },
    ratingsQuantity: {
      type: Number,
      default: 0
    },
    price: {
      type: Number,
      required: [true, 'A tour must have a price']
    },
    priceDiscount: {
      type: Number,
      validate: {
        validator: function(val: number): boolean {
          // this only points to current doc on NEW document creation
          return val < this.price;
        },
        message: 'Discount price ({VALUE}) should be lower than regular price'
      } as any
    },
    summary: {
      type: String,
      trim: true,
      required: [true, 'A tour must have a summary']
    },
    description: {
      type: String,
      trim: true
    },
    imageCover: {
      type: String,
      required: [true, 'A tour must have a cover image']
    },
    images: [String],
    createdAt: {
      type: Date,
      default: Date.now(),
      select: false
    },
    startDates: [Date],
    secretTour: {
      type: Boolean,
      default: false
    },
    startLocation: {
      // GeoJSON
      // type is required
      type: {
        type: String,
        default: 'Point',
        enum: ['Point']
      },
      // coordinates is required
      coordinates: [Number],
      address: String,
      description: String
    },
    locations: [
      {
        type: {
          type: String,
          default: 'Point',
          enum: ['Point']
        },
        coordinates: [Number],
        address: String,
        description: String,
        day: Number
      }
    ],
    guides: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ]
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);
// For performance to not look through all the documents
tourSchema.index({ price: 1, ratingsAverage: -1 });
tourSchema.index({ slug: 1 });
// Required for geospatial queries and aggregation geoNear query
tourSchema.index({ startLocation: '2dsphere' });

tourSchema.virtual('durationWeeks').get(function(this: ITour) {
  return this.duration / 7;
});

// Virtual populate of reviews
tourSchema.virtual('reviews', {
  ref: 'Review',
  foreignField: 'tour',
  localField: '_id'
});

// DOCUMENT MIDDLEWARE: runs before .save() and .create()
tourSchema.pre<ITour>('save', function(next) {
  this.slug = slugify(this.name, { lower: true });
  next();
});

tourSchema.pre<mongoose.Query<IUser>>(/^find/, function(next) {
  this.find({ secretTour: { $ne: true } });
  next();
});

tourSchema.pre<mongoose.Query<IUser>>(/^find/, function(next) {
  this.populate({
    path: 'guides',
    select: '-__v -passwordChangedAt'
  });
  next();
});

const Tour = mongoose.model<ITour, ITourModel>('Tour', tourSchema);

export default Tour;
