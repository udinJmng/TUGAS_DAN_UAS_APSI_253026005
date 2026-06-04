require('dotenv').config();
const mysql = require('mysql');

const pool = mysql.createPool({
  host:            process.env.DB_HOST     || 'localhost',
  user:            process.env.DB_USER     || 'root',
  password:        process.env.DB_PASSWORD || '',
  database:        process.env.DB_NAME     || '5days_radio',
  connectionLimit: 10,
  charset:         'utf8mb4',
});

// Promisify so routes can use async/await
pool.query = ((original) => {
  return function (sql, values) {
    return new Promise((resolve, reject) => {
      const cb = (err, results) => (err ? reject(err) : resolve(results));
      values !== undefined
        ? original.call(pool, sql, values, cb)
        : original.call(pool, sql, cb);
    });
  };
})(pool.query);

module.exports = pool;
