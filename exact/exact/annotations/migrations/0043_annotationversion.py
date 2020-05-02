# Generated by Django 3.0 on 2020-05-01 11:12

import django.contrib.postgres.fields.jsonb
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('images', '0025_setversion'),
        ('annotations', '0042_annotationmediafile'),
    ]

    operations = [
        migrations.CreateModel(
            name='AnnotationVersion',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('deleted', models.BooleanField(default=False)),
                ('vector', django.contrib.postgres.fields.jsonb.JSONField(null=True)),
                ('annotation', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='annotations.Annotation')),
                ('annotation_type', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='annotations.AnnotationType')),
                ('image', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='images.Image')),
                ('version', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='images.SetVersion')),
            ],
        ),
    ]
