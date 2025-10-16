// backend/controllers/reviewController.js
import Review from '../models/Review.js';
import { sendMail } from '../nodemailer.config.js';
import { validationResult } from 'express-validator';

// Constants
const DEFAULT_PAGINATION = {
  PAGE: 1,
  LIMIT: 10,
  MAX_LIMIT: 50
};

const RATING_CONFIG = {
  MIN: 1,
  MAX: 5
};

// Response messages
const MESSAGES = {
  REVIEW: {
    CREATED: 'Avis créé avec succès',
    DELETED: 'Avis supprimé avec succès',
    LIST_SUCCESS: 'Avis récupérés avec succès',
    STATS_SUCCESS: 'Statistiques des avis récupérées',
    NOT_FOUND: 'Avis non trouvé',
    ALREADY_REVIEWED: 'Vous avez déjà soumis un avis',
    UPDATED: 'Avis mis à jour avec succès'
  },
  ERROR: {
    VALIDATION: 'Données de formulaire invalides',
    RATING_REQUIRED: 'La note est obligatoire',
    INVALID_RATING: `La note doit être entre ${RATING_CONFIG.MIN} et ${RATING_CONFIG.MAX}`,
    SERVER: 'Erreur interne du serveur',
    UNAUTHORIZED: 'Non autorisé à modifier cet avis'
  },
  EMAIL: {
    NEW_REVIEW_SUBJECT: '⭐ Nouvel avis reçu sur votre portfolio',
    REVIEW_APPROVED_SUBJECT: '✅ Votre avis a été approuvé'
  }
};

/**
 * Sanitize review data for responses
 */
const sanitizeReview = (review) => {
  const obj = review.toObject ? review.toObject() : review;
  
  return {
    id: obj._id,
    rating: obj.rating,
    comment: obj.comment,
    status: obj.status || 'pending',
    isFeatured: obj.isFeatured || false,
    user: obj.user ? {
      id: obj.user._id,
      name: obj.user.name,
      email: obj.user.email,
      role: obj.user.role
    } : null,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };
};

/**
 * Validate rating value
 */
const isValidRating = (rating) => {
  const numRating = Number(rating);
  return !isNaN(numRating) && 
         numRating >= RATING_CONFIG.MIN && 
         numRating <= RATING_CONFIG.MAX &&
         Number.isInteger(numRating);
};

/**
 * Send new review notification (non-blocking)
 */
const sendReviewNotification = async (review, user) => {
  try {
    await sendMail({
      from: process.env.EMAIL_FROM || `"Portfolio" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      subject: MESSAGES.EMAIL.NEW_REVIEW_SUBJECT,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b; text-align: center;">⭐ Nouvel avis reçu</h2>
          <div style="background: #fffbeb; padding: 25px; border-radius: 10px; margin: 20px 0;">
            <p><strong>Utilisateur :</strong> ${user.name} (${user.email})</p>
            <p><strong>Note :</strong> ${'⭐'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)} (${review.rating}/5)</p>
            <p><strong>Date :</strong> ${new Date().toLocaleString('fr-FR')}</p>
            <div style="margin-top: 15px;">
              <strong>Commentaire :</strong>
              <div style="background: white; padding: 15px; border-radius: 4px; margin-top: 5px; border-left: 4px solid #f59e0b;">
                ${review.comment ? review.comment.replace(/\n/g, '<br>') : '<em>Aucun commentaire</em>'}
              </div>
            </div>
          </div>
          <div style="text-align: center; margin-top: 20px;">
            <a href="${process.env.ADMIN_URL || process.env.BASE_URL}/admin/reviews" 
               style="background: #f59e0b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              Gérer les avis
            </a>
          </div>
        </div>
      `,
      text: `Nouvel avis reçu de ${user.name} (${user.email}):\n\nNote: ${review.rating}/5\nCommentaire: ${review.comment || 'Aucun'}\n\nDate: ${new Date().toLocaleString('fr-FR')}`
    });
    
    console.log(`✅ Review notification sent for user: ${user.email}`);
  } catch (error) {
    console.warn('⚠️ Review notification email failed:', error.message);
  }
};

/**
 * Send review approval notification to user (non-blocking)
 */
const sendApprovalNotification = async (review, user) => {
  try {
    await sendMail({
      from: process.env.EMAIL_FROM || `"Portfolio" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: MESSAGES.EMAIL.REVIEW_APPROVED_SUBJECT,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981; text-align: center;">✅ Votre avis a été approuvé</h2>
          <div style="background: #ecfdf5; padding: 25px; border-radius: 10px; margin: 20px 0;">
            <p>Bonjour <strong>${user.name}</strong>,</p>
            <p>Merci d'avoir partagé votre avis ! Il a été approuvé et est maintenant visible sur notre portfolio.</p>
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <p><strong>Votre note :</strong> ${'⭐'.repeat(review.rating)}</p>
              ${review.comment ? `<p><strong>Votre commentaire :</strong> "${review.comment}"</p>` : ''}
            </div>
            <p>Votre feedback nous aide à nous améliorer continuellement.</p>
          </div>
        </div>
      `,
      text: `Bonjour ${user.name},\n\nVotre avis a été approuvé et est maintenant visible sur notre portfolio.\n\nNote: ${review.rating}/5\n${review.comment ? `Commentaire: "${review.comment}"` : ''}\n\nMerci pour votre feedback !`
    });
    
    console.log(`✅ Approval notification sent to: ${user.email}`);
  } catch (error) {
    console.warn('⚠️ Approval notification email failed:', error.message);
  }
};

/**
 * PUBLIC/ADMIN: Get all reviews with pagination and filtering
 * GET /api/reviews
 */
export const listReviews = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || DEFAULT_PAGINATION.PAGE, 1);
    const limit = Math.min(
      parseInt(req.query.limit) || DEFAULT_PAGINATION.LIMIT, 
      DEFAULT_PAGINATION.MAX_LIMIT
    );
    const skip = (page - 1) * limit;

    // Build filter based on user role
    const filter = {};
    
    // Public users only see approved and featured reviews
    if (!req.user || req.user.role !== 'admin') {
      filter.status = 'approved';
    }
    
    // Filter by status (admin only)
    if (req.query.status && (req.user?.role === 'admin')) {
      filter.status = req.query.status;
    }
    
    // Filter by featured
    if (req.query.featured !== undefined) {
      filter.isFeatured = req.query.featured === 'true';
    }
    
    // Filter by minimum rating
    if (req.query.minRating) {
      const minRating = parseInt(req.query.minRating);
      if (!isNaN(minRating)) {
        filter.rating = { $gte: minRating };
      }
    }

    // Select fields for population
    const userFields = 'name email role';
    
    // Execute queries in parallel
    const [reviews, total, approvedCount, featuredCount] = await Promise.all([
      Review.find(filter)
        .populate('user', userFields)
        .sort({ 
          isFeatured: -1, 
          createdAt: -1 
        })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(filter),
      Review.countDocuments({ status: 'approved' }),
      Review.countDocuments({ isFeatured: true, status: 'approved' })
    ]);

    res.json({
      success: true,
      message: MESSAGES.REVIEW.LIST_SUCCESS,
      data: {
        reviews: reviews.map(sanitizeReview),
        pagination: {
          page,
          limit,
          total,
          approvedCount,
          featuredCount,
          pages: Math.ceil(total / limit)
        }
      },
      code: 'REVIEWS_RETRIEVED'
    });

  } catch (error) {
    console.error('❌ listReviews error:', {
      message: error.message,
      query: req.query,
      user: req.user?.id,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: MESSAGES.ERROR.SERVER,
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * PUBLIC: Create a new review
 * POST /api/reviews
 */
export const createReview = async (req, res) => {
  try {
    // Check validation errors from express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        message: MESSAGES.ERROR.VALIDATION,
        errors: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }

    const { rating, comment } = req.body;

    // Additional validation
    if (!rating) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.ERROR.RATING_REQUIRED,
        code: 'RATING_REQUIRED'
      });
    }

    if (!isValidRating(rating)) {
      return res.status(400).json({
        success: false,
        message: MESSAGES.ERROR.INVALID_RATING,
        code: 'INVALID_RATING'
      });
    }

    // Check if user already submitted a review
    const existingReview = await Review.findOne({ user: req.user.id });
    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: MESSAGES.REVIEW.ALREADY_REVIEWED,
        code: 'ALREADY_REVIEWED'
      });
    }

    // Create review (initially pending for admin approval)
    const reviewData = {
      user: req.user.id,
      rating: parseInt(rating),
      comment: comment?.trim() || '',
      status: 'pending', // Requires admin approval
      isFeatured: false
    };

    const review = await Review.create(reviewData);
    
    // Populate user data for notification
    const populatedReview = await Review.findById(review._id).populate('user', 'name email');

    // Send notification to admin (non-blocking)
    sendReviewNotification(populatedReview, populatedReview.user);

    res.status(201).json({
      success: true,
      message: MESSAGES.REVIEW.CREATED,
      data: {
        review: sanitizeReview(populatedReview)
      },
      code: 'REVIEW_CREATED'
    });

  } catch (error) {
    console.error('❌ createReview error:', {
      message: error.message,
      userId: req.user?.id,
      rating: req.body?.rating,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: MESSAGES.ERROR.SERVER,
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * ADMIN: Update review status
 * PATCH /api/reviews/:id/status
 */
export const updateReviewStatus = async (req, res) => {
  try {
    const { status, isFeatured } = req.body;
    
    if (!status && isFeatured === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Status ou statut featured requis',
        code: 'MISSING_UPDATE_DATA'
      });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (isFeatured !== undefined) updateData.isFeatured = isFeatured;

    const review = await Review.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('user', 'name email');

    if (!review) {
      return res.status(404).json({
        success: false,
        message: MESSAGES.REVIEW.NOT_FOUND,
        code: 'REVIEW_NOT_FOUND'
      });
    }

    // Send approval notification if status changed to approved
    if (status === 'approved' && review.user) {
      sendApprovalNotification(review, review.user);
    }

    res.json({
      success: true,
      message: MESSAGES.REVIEW.UPDATED,
      data: {
        review: sanitizeReview(review)
      },
      code: 'REVIEW_UPDATED'
    });

  } catch (error) {
    console.error('❌ updateReviewStatus error:', {
      message: error.message,
      reviewId: req.params.id,
      body: req.body,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: MESSAGES.ERROR.SERVER,
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * ADMIN/USER: Delete review
 * DELETE /api/reviews/:id
 */
export const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    
    if (!review) {
      return res.status(404).json({
        success: false,
        message: MESSAGES.REVIEW.NOT_FOUND,
        code: 'REVIEW_NOT_FOUND'
      });
    }

    // Check permissions: users can only delete their own reviews
    if (req.user.role !== 'admin' && review.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: MESSAGES.ERROR.UNAUTHORIZED,
        code: 'UNAUTHORIZED'
      });
    }

    await Review.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: MESSAGES.REVIEW.DELETED,
      code: 'REVIEW_DELETED'
    });

  } catch (error) {
    console.error('❌ deleteReview error:', {
      message: error.message,
      reviewId: req.params.id,
      userId: req.user?.id,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: MESSAGES.ERROR.SERVER,
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * ADMIN: Get reviews statistics
 * GET /api/reviews/stats
 */
export const getReviewStats = async (req, res) => {
  try {
    const stats = await Review.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          averageRating: { $avg: '$rating' },
          ratingDistribution: {
            $push: {
              rating: '$rating',
              count: 1
            }
          },
          statusCount: {
            $push: {
              status: '$status',
              count: 1
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          total: 1,
          averageRating: { $round: ['$averageRating', 2] },
          ratingDistribution: {
            $arrayToObject: {
              $map: {
                input: [1, 2, 3, 4, 5],
                as: 'r',
                in: {
                  k: { $toString: '$$r' },
                  v: {
                    $size: {
                      $filter: {
                        input: '$ratingDistribution',
                        as: 'rd',
                        cond: { $eq: ['$$rd.rating', '$$r'] }
                      }
                    }
                  }
                }
              }
            }
          },
          statusCount: {
            $arrayToObject: {
              $map: {
                input: ['pending', 'approved', 'rejected'],
                as: 's',
                in: {
                  k: '$$s',
                  v: {
                    $size: {
                      $filter: {
                        input: '$statusCount',
                        as: 'sc',
                        cond: { $eq: ['$$sc.status', '$$s'] }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    ]);

    const result = stats[0] || {
      total: 0,
      averageRating: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      statusCount: { pending: 0, approved: 0, rejected: 0 }
    };

    // Get featured reviews count
    const featuredCount = await Review.countDocuments({ 
      isFeatured: true, 
      status: 'approved' 
    });

    res.json({
      success: true,
      message: MESSAGES.REVIEW.STATS_SUCCESS,
      data: {
        stats: {
          ...result,
          featuredCount
        }
      },
      code: 'REVIEW_STATS_RETRIEVED'
    });

  } catch (error) {
    console.error('❌ getReviewStats error:', {
      message: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: MESSAGES.ERROR.SERVER,
      code: 'SERVER_ERROR'
    });
  }
};
export default {
  listReviews,
  createReview,
  updateReviewStatus,
  deleteReview,
  getReviewStats
};