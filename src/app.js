const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.use('/api', routes);
app.use('/api', notFound);
app.use('/api', errorHandler);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(notFound);

module.exports = app;
