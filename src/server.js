const express = require('express')
const { exec } = require('child_process')
const config = require('./config')

const app = express()

// Planted finding #2 -- CodeQL js/command-line-injection.
// req.query.host flows unsanitised into a shell command.
app.get('/diagnostics/ping', (req, res) => {
  const host = req.query.host
  exec(`ping -c 1 ${host}`, (err, stdout) => {
    if (err) return res.status(500).send('ping failed')
    res.type('text/plain').send(stdout)
  })
})

app.get('/health', (_req, res) => res.json({ ok: true, region: config.region }))

app.listen(3000, () => console.log('listening on :3000'))
