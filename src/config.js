// Application configuration.
//
// Credentials are read from the environment -- this file is deliberately clean.
// The secret scanning demonstration adds a synthetic credential here at demo
// time so the audience watches push protection reject it, rather than seeing a
// repository that has already leaked. See Stage 2 in the README.

module.exports = {
  region: process.env.AWS_REGION || 'us-east-1',

  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,

  dbHost: process.env.DB_HOST || 'localhost',
  dbUser: process.env.DB_USER || 'app'
}
