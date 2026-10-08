const express = require('express');
const router = express.Router();
const controller = require('../controllers/areasController');
const { permitir } = require('../middlewares/auth');

router.get('/', controller.listar);
router.get('/:id', controller.buscarPorId);
router.post('/', permitir('admin'), controller.criar);
router.patch('/:id', permitir('admin'), controller.atualizar);
router.delete('/:id', permitir('admin'), controller.remover);

module.exports = router;
