exports.notFound = (req, res) => res.status(404).json({ success: false, message: 'Route not found' });
exports.errorHandler = (err, req, res, next) => {
  let status = err.status || 500, message = err.message;
  if (err.code === 'ER_DUP_ENTRY') { status = 409; message = 'Duplicate value: record already exists'; }
  else if (err.code === 'ER_ROW_IS_REFERENCED_2') { status = 409; message = 'Record is in use and cannot be deleted'; }
  else if (err.code === 'ER_NO_REFERENCED_ROW_2') { status = 400; message = 'Referenced record does not exist'; }
  else if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') { status = 400; message = 'Value violates a data rule (check prices/quantity)'; }
  else if (['WARN_DATA_TRUNCATED', 'ER_DATA_TOO_LONG', 'ER_TRUNCATED_WRONG_VALUE', 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD', 'ER_WARN_DATA_OUT_OF_RANGE', 'ER_BAD_NULL_ERROR'].includes(err.code)) { status = 400; message = 'Invalid value in one of the fields'; }
  else if (err.type === 'entity.parse.failed') { status = 400; message = 'Malformed JSON body'; }
  if (status === 500) console.error(err);
  res.status(status).json({ success: false, message: status === 500 ? 'Internal server error' : message });
};
