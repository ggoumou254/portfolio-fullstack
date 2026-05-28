// backend/routes/statsRoutes.js
import express from 'express';
import Project from '../models/Project.js';

const router = express.Router();

/**
 * GET /api/stats/overview
 * Totali essenziali + top technologies
 */
router.get('/overview', async (_req, res) => {
  try {
    const [totalProjects, topTech] = await Promise.all([
      Project.countDocuments({}),
      Project.aggregate([
        { $match: { status: 'published' } },
        { $unwind: { path: '$technologies', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$technologies', count: { $sum: 1 } } },
        { $project: { _id: 0, label: '$_id', count: 1 } },
        { $sort: { count: -1, label: 1 } },
        { $limit: 10 }
      ])
    ]);

    // se vuoi contatti/iscritti e non hai i modelli: metti 0
    const totalContacts = 0;
    const totalSubscribers = 0;

    res.json({
      success: true,
      data: {
        totalProjects,
        totalContacts,
        totalSubscribers,
        topTechnologies: topTech
      },
      code: 'STATS_OVERVIEW_OK'
    });
  } catch (err) {
    console.error('❌ stats overview:', err);
    res.status(500).json({ success: false, message: 'Erreur stats overview', code: 'STATS_ERROR' });
  }
});

/**
 * GET /api/stats/projects
 * Statistiche dettagliate progetti
 */
router.get('/projects', async (_req, res, next) => {
  try {
    const now = new Date();
    const d7  = new Date(now);  d7.setDate(d7.getDate() - 7);
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30);

    const [overviewAgg] = await Project.getStats();
    const [last7days, last30days, byTechAgg] = await Promise.all([
      Project.countDocuments({ createdAt: { $gte: d7 } }),
      Project.countDocuments({ createdAt: { $gte: d30 } }),
      Project.aggregate([
        { $unwind: { path: '$technologies', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$technologies', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 10 }
      ])
    ]);

    const payload = {
      totals: overviewAgg?.total || 0,
      published: overviewAgg?.published || 0,
      featured: overviewAgg?.featured || 0,
      totalViews: overviewAgg?.totalViews || 0,
      avgViews: overviewAgg?.avgViews || 0,
      statusCount: overviewAgg?.statusCount || { draft: 0, published: 0, archived: 0 },
      categoryCount: overviewAgg?.categoryCount || {},
      last7days,
      last30days,
      byTech: byTechAgg.map(t => ({ tech: t._id, count: t.count }))
    };

    res.json({ success: true, data: payload, code: 'STATS_PROJECTS_OK' });
  } catch (e) {
    next(e);
  }
});

export default router;
