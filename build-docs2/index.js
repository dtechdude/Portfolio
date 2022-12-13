// Build helpcenter website

const { ObjectId, MongoClient } = require('mongodb')
const AWS = require('aws-sdk')
const path = require('path')
// const fs = require('fs')
const Bugsnag = require('@bugsnag/js')
const AWS_CONFIG = {
  accessKeyId: process.env.AWS_KEY,
  secretAccessKey: process.env.AWS_SECRET
}
const s3 = new AWS.S3(AWS_CONFIG)
const { Liquid } = require('liquidjs')
const engine = new Liquid({
  root: path.resolve(__dirname, 'docs_templates'),
  extname: '.liquid'
})
function slugify (str) {
  str = str.replace(/^\s+|\s+$/g, '')

  // Make the string lowercase
  str = str.toLowerCase()

  // Remove accents, swap ñ for n, etc
  const from = 'áäâàãåčçćďéěëèêẽĕȇíìîïňñóöòôõøðřŕšťúůüùûýÿžþÞĐđßÆa·/_,:;'
  const to = 'aaaaaacccdeeeeeeeeiiiinnooooooorrstuuuuuyyzbBDdBAa------'
  for (let i = 0, l = from.length; i < l; i++) {
    str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i))
  }

  // Remove invalid chars
  str = str.replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

  return str
}
engine.registerFilter('slugify', str => slugify(str))

Bugsnag.start({
  apiKey: process.env.BS_KEY,
  appType: 'build-docs',
  logger: null
})
let db

async function upload (file, content) {
  // return fs.writeFileSync('docs/' + file, content)
  return (() => new Promise(resolve => {
    s3.upload({
      ACL: 'public-read',
      ContentType: 'text/html',
      Body: content,
      Bucket: process.env.AWS_DOCS_BUCKET,
      Key: file
    }, (err, r) => {
      if (err) {
        Bugsnag.notify(err)
        return resolve()
      }
      resolve()
    })
  }))()
}

exports.handler = async (event) => {
  const data = JSON.parse(Buffer.from(event.data, 'base64'))
  if (!data.domain) {
    return
  }

  try {
    if (!db) {
      const client = new MongoClient(process.env.DB_URL)
      await client.connect()
      db = client.db(process.env.DB_NAME)
    }

    const domain = await db.collection('domains').findOne({
      _id: new ObjectId(data.domain)
    })
    if (!domain) {
      return
    }
    if (domain.locked || domain.disabled) {
      return
    }

    const site = await db.collection('docs').findOne({
      domain_id: domain._id
    })
    if (!site) {
      return
    }

    // 1. First page
    const locale = data.locale ?? site.locale
    const localelc = locale.toLowerCase()
    const o = {
      page: {
        title: site.title,
        locale: localelc,
        description: site.description
      },
      site: {
        domain: domain._id,
        title: site.title,
        menu: site.menu ?? [],
        footer: site.footer ?? []
      },
      collections: [],
      categories: [],
      articles: []
    }
    if (site.logo) {
      o.site.logo = process.env.AWS_CLOUDFRONT + '/' + site.logo
    }
    if (site.css) {
      o.site.css = site.css
    }
    if (site.header_color) {
      o.site.header_color = site.header_color
    }
    if (!site.no_promo) {
      o.site.promo = true
    }

    let prefix = site.domain ? `${site.domain}/` : `${site.subdomain}.${process.env.DOCS_DOMAIN}/`
    if (site.redirects) {
      for (const redirect of site.redirects) {
        let to = redirect.to
        if (to.startsWith('/')) {
          to = to.substr(1)
        }
        let from = redirect.from
        if (from.startsWith('/')) {
          from = from.substr(1)
        }
        const content = `<!DOCTYPE html><html>
        <head><meta http-equiv="refresh" content="0; url=/${to}" /></head>
        <body></body></html>`
        await upload(`${prefix}${from}`, content)
      }
    }

    // Collections
    const collections = await db.collection('docs_collections').find({
      domain_id: domain._id,
      locale
    }, {
      sort: {
        order: 1
      }
    }).toArray()
    if (collections && collections.length) {
      o.collections = collections.map(c => {
        return {
          id: c._id,
          title: c.title,
          description: c.description,
          icon: c.icon
        }
      })
    }
    // Categories without collections
    const categories = await db.collection('docs_categories').find({
      domain_id: domain._id,
      collection: '',
      locale
    }, {
      projection: {
        _id: 1,
        title: 1
      },
      sort: {
        order: 1
      }
    }).toArray()
    if (categories && categories.length) {
      o.categories = categories.map(async c => {
        const articles = await db.collection('docs_articles').find({
          domain_id: domain._id,
          category: c._id,
          published: true,
          locale
        }, {
          projection: {
            _id: 1,
            title: 1
          },
          sort: {
            order: 1
          }
        }).toArray()
        return {
          id: c._id,
          title: c.title,
          articles: articles.map(a => {
            return {
              id: a._id,
              title: a.title
            }
          })
        }
      })
    }
    // Articles without categories
    const articles = await db.collection('docs_articles').find({
      domain_id: domain._id,
      published: true,
      category: '',
      locale
    }, {
      projection: {
        _id: 1,
        title: 1
      },
      sort: {
        order: 1
      }
    }).toArray()
    if (articles.length) {
      o.articles = articles.map(a => {
        return {
          id: a._id,
          title: a.title
        }
      })
    }

    if (!data.locale) {
      // 1b. Redirect page
      const content = `<!DOCTYPE html><html>
      <head>
        <meta http-equiv="refresh" content="0; url=/${localelc}/" />
      </head>
      <body></body></html>`
      await upload(`${prefix}index.html`, content)
    }

    // For non-dir path (eg /en-us instead of /en-us/)
    await upload(`${prefix}${localelc}`, `<!DOCTYPE html><html>
    <head>
      <meta http-equiv="refresh" content="0; url=/${localelc}/" />
    </head>
    <body></body></html>`)

    let content = await engine.renderFile('index', o)
    prefix += `${localelc}/`
    let key = `${prefix}index.html`
    await upload(key, content)

    // 2. Collection pages
    let docs = await db.collection('docs_collections').find({
      domain_id: domain._id,
      locale
    }, {
      sort: {
        order: 1
      }
    }).toArray()
    if (docs && docs.length) {
      for (const collection of docs) {
        o.page.description = collection.title
        o.collection = {
          id: collection._id,
          title: collection.title,
          categories: []
        }
        // Categories
        const categories = await db.collection('docs_categories').find({
          domain_id: domain._id,
          collection: collection._id,
          locale
        }, {
          projection: {
            _id: 1,
            title: 1
          },
          sort: {
            order: 1
          }
        }).toArray()
        if (categories && categories.length) {
          for (const category of categories) {
            const articles = await db.collection('docs_articles').find({
              domain_id: domain._id,
              category: category._id,
              published: true,
              locale
            }, {
              projection: {
                _id: 1,
                title: 1
              },
              sort: {
                order: 1
              }
            }).toArray()
            o.collection.categories.push({
              id: category._id,
              title: category.title,
              articles: articles.map(a => {
                return {
                  id: a._id,
                  title: a.title
                }
              })
            })
          }
        }
        // build
        content = await engine.renderFile('collection', o)
        key = `${prefix}c/${collection._id}-${slugify(collection.title)}`
        await upload(key, content)
      }
    }

    // 3. Category pages
    docs = await db.collection('docs_categories').find({
      domain_id: domain._id,
      locale
    }, {
      projection: {
        _id: 1,
        title: 1
      },
      sort: {
        order: 1
      }
    }).toArray()
    if (docs && docs.length) {
      for (const category of docs) {
        o.page.description = category.title
        o.category = {
          id: category._id,
          title: category.title
        }
        // Get collection
        if (category.collection) {
          const collection = await db.collection('docs_collections').findOne({
            _id: category.collection,
            domain_id: domain._id
          })
          if (collection) {
            o.category.collection = collection.title
            o.category.collection_id = collection._id
          }
        }
        const articles = await db.collection('docs_articles').find({
          domain_id: domain._id,
          category: category._id,
          published: true,
          locale
        }, {
          projection: {
            _id: 1,
            title: 1,
            excerpt: 1
          },
          sort: {
            order: 1
          }
        }).toArray()
        o.category.articles = articles.map(a => {
          return {
            id: a._id,
            title: a.title,
            excerpt: a.excerpt
          }
        })
        // build
        content = await engine.renderFile('category', o)
        key = `${prefix}c/${category._id}-${slugify(category.title)}`
        await upload(key, content)
      }
    }

    // 4. Article pages
    docs = await db.collection('docs_articles').find({
      domain_id: domain._id,
      published: true,
      locale
    }, {
      sort: {
        order: 1
      }
    }).toArray()
    if (docs && docs.length) {
      for (const article of docs) {
        o.page.description = article.excerpt ?? article.title
        o.article = {
          id: article._id,
          title: article.title,
          excerpt: article.excerpt,
          body: article.body
        }
        // Get category
        if (article.category) {
          const category = await db.collection('docs_categories').findOne({
            _id: article.category,
            domain_id: domain._id
          })
          if (category) {
            o.article.category = category.title
            o.article.category_id = category._id
          }
          // Get collection
          if (category.collection) {
            const collection = await db.collection('docs_collections').findOne({
              _id: category.collection,
              domain_id: domain._id
            })
            if (collection) {
              o.article.collection = collection.title
              o.article.collection_id = collection._id
            }
          }
        }
        // build
        content = await engine.renderFile('article', o)
        key = `${prefix}a/${article._id}-${slugify(article.title)}`
        await upload(key, content)
      }
    }

    // console.log('done')
  } catch (err) {
    db = null
    // console.log(err)
    Bugsnag.notify(err)
  }
}
