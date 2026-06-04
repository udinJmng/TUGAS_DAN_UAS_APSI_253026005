const mysql = require('mysql');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: '5days_radio',
  connectionLimit: 10,
  charset: 'utf8mb4',
});

pool.query = ((originalQuery) => {
  return function (sql, values) {
    return new Promise((resolve, reject) => {
      const callback = (err, results) => {
        if (err) return reject(err);
        resolve(results);
      };
      if (values !== undefined) {
        originalQuery.call(pool, sql, values, callback);
      } else {
        originalQuery.call(pool, sql, callback);
      }
    });
  };
})(pool.query);

module.exports = pool;
