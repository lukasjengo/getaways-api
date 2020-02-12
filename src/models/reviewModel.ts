import mongoose from 'mongoose';
import Tour from './tourModel';

interface IReviewSchema extends mongoose.Document {
  review: string;
  rating: number;
  user: typeof mongoose.Schema.Types.ObjectId;
  tour: typeof mongoose.Schema.Types.ObjectId;
  createdAt: Date;
}

export interface IReview extends IReviewSchema {}

export interface IReviewModel extends mongoose.Model<IReview> {
  calcAverageRatings: (tourID: string) => Promise<IReview>;
}

const reviewSchema = new mongoose.Schema<IReview>(
  {
    review: {
      type: String,
      required: [true, 'Review text cannot be empty.']
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: [true, 'Review rating is required.']
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Review must belong to a user.']
    },
    tour: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tour',
      required: [true, 'Review must belong to a tour.']
    },
    createdAt: {
      type: Date,
      default: Date.now()
    }
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// This refers to current query
reviewSchema.pre<IReview>(/^find/, function(next) {
  this.populate({ path: 'user', select: 'name photo' });
  next();
});

reviewSchema.statics.calcAverageRatings = async function(tourId: string) {
  const stats = await this.aggregate([
    {
      $match: { tour: tourId }
    },
    {
      $group: {
        _id: '$tour',
        nRating: { $sum: 1 },
        avgRating: { $avg: '$rating' }
      }
    }
  ]);

  if (stats.length > 0) {
    await Tour.findByIdAndUpdate(tourId, {
      ratingsQuantity: stats[0].nRating,
      ratingsAverage: stats[0].avgRating
    });
  } else {
    await Tour.findByIdAndUpdate(tourId, {
      ratingsQuantity: 0,
      ratingsAverage: 4.5
    });
  }
};

// 1 user can only post 1 review on the same tour
reviewSchema.index({ tour: 1, user: 1 }, { unique: true });

reviewSchema.post<IReview>('save', function(this: any) {
  // this points to current review
  this.constructor.calcAverageRatings(this.tour);
});

// For findByIdAndUpdate and findByIdAndDelete
reviewSchema.pre<IReviewModel>(/^findOneAnd/, async function(this: any, next) {
  // this points to current query
  this.rev = await this.findOne();
  next();
});

reviewSchema.post(/^findOneAnd/, async function(this: any) {
  await this.rev.constructor.calcAverageRatings(this.rev.tour);
});

const Review = mongoose.model<IReview, IReviewModel>('Review', reviewSchema);

export default Review;
