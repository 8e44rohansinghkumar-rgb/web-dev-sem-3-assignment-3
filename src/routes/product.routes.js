const express = require('express');
const controller = require('../controllers/product.controller');
const validateObjectId = require('../middleware/validateObjectId');
const { validateProductBody, validateStockChange } = require('../middleware/validateProduct');

const router = express.Router();

/* ---- Reports: declared BEFORE /:id so they are not read as an ObjectId ---- */
router.get('/low-stock', controller.getLowStockProducts);
router.get('/summary', controller.getCategorySummary);

/* ---- CRUD ---- */
router
  .route('/')
  .get(controller.getProducts)
  .post(validateProductBody('create'), controller.createProduct);

router
  .route('/:id')
  .get(validateObjectId(), controller.getProductById)
  .put(validateObjectId(), validateProductBody('update'), controller.updateProduct)
  .delete(validateObjectId(), controller.deleteProduct);

/* ---- Stock adjustment (restock / sale) ---- */
router.patch('/:id/stock', validateObjectId(), validateStockChange, controller.adjustStock);

module.exports = router;
