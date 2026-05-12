module.exports = function(req, res) {
  res.json({ status: 'ok', time: new Date().toISOString() });
};
