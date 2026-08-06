const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');

router.post('/', authenticate, requirePermission('Home Layout Add'), itemController.createItem);
router.get('/', authenticate, requirePermission('Home Layout View'), itemController.getItems)
router.get('/item/:id', authenticate, requirePermission('Home Layout View'), itemController.getItem)
router.put('/:id', authenticate, requirePermission('Home Layout Edit'), itemController.updateItem);
router.delete('/:id', authenticate, requirePermission('Home Layout Delete'), itemController.deleteItem);
router.get('/home/details',itemController.getHomePageData)

module.exports = router;
