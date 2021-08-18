import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { dropTask } from 'ember-concurrency-decorators';
import { inject as service } from '@ember/service';

export default class LoginController extends Controller {
  @service session;

  @tracked username;
  @tracked password;
  @tracked errorMessage;

  @dropTask
  *onSubmit() {
    try {
      let { username, password } = this;
      yield this.session.authenticate('authenticator:jwt', { username, password });
    } catch (error) {
      if (error.status === 401) {
        this.errorMessage = 'Invalid username or password';
      } else {
        this.errorMessage = 'There was an error. Please try again later.';
      }
    }

    if (this.session.isAuthenticated) {
      console.log('success!');
    }
  }
}
