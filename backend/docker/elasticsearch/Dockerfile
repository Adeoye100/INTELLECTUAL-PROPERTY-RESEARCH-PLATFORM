FROM docker.elastic.co/elasticsearch/elasticsearch:9.4.2

# This official plugin version is resolved by Elasticsearch itself and therefore
# stays locked to the exact server version in the base image.
RUN bin/elasticsearch-plugin install --batch analysis-phonetic
